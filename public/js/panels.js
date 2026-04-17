import { initAllGvmPanes, ensurePaneVisible } from './gvm/gvm-pane.js';
import { initAllGvmLists } from './gvm/gvm-lists.js';
import { initAllGvmEditors } from './gvm/gvm-editors.js';
import { initAllGvmContextMenus } from './gvm/gvm-ctx-menus.js';
import { state } from './state.js';
import { escHtml, escAttr, toast, openModal, spinner, empty } from './utils.js';
import { loadLog } from './log.js';
import { loadPRs } from './pr.js';

// ─── Folder Browser ───────────────────────────────────────────────────────────

const browser = { current: '', parentPath: null, callback: null };

export async function openFolderBrowser(callback) {
  browser.callback = callback;

  await navigateBrowser(state.repoPath || '');

  document.getElementById('btnSelectFolder').onclick = () => {
    if (browser.callback) browser.callback(browser.current);
    window.closeModal('modalBrowser');
  };

  openModal('modalBrowser');

  fetch('/api/fs/quickaccess')
    .then(r => r.json())
    .then(places => {
      document.getElementById('browserQuick').innerHTML = places
        .map(p => `<button class="browser-quick-btn" onclick="navigateBrowser('${escAttr(p.path)}')">${escHtml(p.name)}</button>`)
        .join('');
    })
    .catch(() => {});
}

async function navigateBrowser(dirPath) {
  const listEl = document.getElementById('browserList');
  listEl.innerHTML = spinner();

  try {
    const q    = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
    const res  = await fetch(`/api/fs/list${q}`);
    const data = await res.json();

    browser.current    = data.current;
    browser.parentPath = data.parent;

    document.getElementById('browserBreadcrumb').innerHTML      = buildBreadcrumb(data.current);
    document.getElementById('browserSelectedLabel').textContent = data.current || 'Unidades del sistema';

    const upBtn     = document.getElementById('browserUp');
    const hasParent = data.parent != null;
    upBtn.disabled  = !hasParent;
    upBtn.style.opacity = hasParent ? '1' : '.35';
    upBtn.onclick = hasParent ? () => navigateBrowser(data.parent) : null;

    if (data.entries.length === 0) {
      listEl.innerHTML = empty('📂', 'Sin subcarpetas');
      return;
    }
    listEl.innerHTML = data.entries.map(e => `
      <div class="browser-item" onclick="navigateBrowser('${escAttr(e.path)}')">
        <span class="browser-item-icon">📁</span>
        <span class="browser-item-name" title="${escAttr(e.path)}">${escHtml(e.name)}</span>
        <span class="browser-item-enter">→</span>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = empty('⚠', e.message);
  }
}

export function buildBreadcrumb(currentPath) {
  if (!currentPath) {
    return '<span style="color:var(--tx3);font-size:12px;padding:2px 4px">Unidades del sistema</span>';
  }
  const parts   = currentPath.split('/').filter(Boolean);
  const isDrive = parts.length > 0 && /^[A-Za-z]:$/.test(parts[0]);
  const segs    = [];

  parts.forEach((seg, i) => {
    let navPath;
    if (isDrive) {
      navPath = i === 0 ? `${parts[0]}/` : `${parts[0]}/${parts.slice(1, i + 1).join('/')}`;
    } else {
      navPath = '/' + parts.slice(0, i + 1).join('/');
    }
    const label = i === 0 && isDrive ? `${seg}/` : seg;
    if (i > 0) segs.push('<span class="bc-sep">›</span>');
    segs.push(`<span class="bc-seg" onclick="navigateBrowser('${escAttr(navPath)}')" title="${escAttr(navPath)}">${escHtml(label)}</span>`);
  });

  return segs.join('');
}

// ─── Content Tabs (Cambios / Historial / PRs) ──────────────────────────────────

export function switchToPanel(panel) {
  document.querySelectorAll('.side-nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.side-nav-btn[data-panel="${panel}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${panel}`).classList.add('active');
  if (panel === 'log') loadLog();
  if (panel === 'prs') loadPRs();
}

// ─── Commit Badge ─────────────────────────────────────────────────────────────

export function updateCommitBadge() {
  const staged = (state.status?.staged || []).length;
  const badge = document.getElementById('tbCommitBadge');
  if (!badge) return;
  badge.textContent = staged;
  badge.style.display = staged > 0 ? '' : 'none';
}

// ─── Resizable Panels ─────────────────────────────────────────────────────────

// Auto-initialize all declarative UI components
initAllGvmPanes();
initAllGvmLists();
initAllGvmEditors();
initAllGvmContextMenus();

export function ensureSplitVisible(selector, direction, minVisible) {
  ensurePaneVisible(selector, direction, minVisible);
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.buildBreadcrumb   = buildBreadcrumb;
window.switchToPanel     = switchToPanel;
window.updateCommitBadge = updateCommitBadge;
window.openFolderBrowser = openFolderBrowser;
window.navigateBrowser   = navigateBrowser;
window.ensureSplitVisible = ensureSplitVisible;
