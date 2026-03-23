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

const PANEL_STORAGE_PREFIX = 'gvm_panel_';

function savePanelSize(key, size) {
  try { localStorage.setItem(PANEL_STORAGE_PREFIX + key, size); } catch (_) {}
}

function loadPanelSize(key) {
  try { return parseInt(localStorage.getItem(PANEL_STORAGE_PREFIX + key)); } catch (_) {}
  return NaN;
}

function initResizer(el, getTarget, direction, min, max, invert = false, storageKey = null, peekTarget = null) {
  if (!el) return;
  let dragging = false, startPos = 0, startSize = 0;

  if (storageKey) {
    const saved = loadPanelSize(storageKey);
    if (!isNaN(saved) && saved >= min && saved <= max) {
      requestAnimationFrame(() => {
        const target = peekTarget ? peekTarget() : getTarget();
        if (!target) return;
        if (direction === 'col') target.style.width = saved + 'px';
        else { target.style.flex = `0 0 ${saved}px`; target.style.height = saved + 'px'; }
      });
    }
  }

  el.addEventListener('mousedown', e => {
    dragging = true;
    el.classList.add('dragging');
    startPos  = direction === 'col' ? e.clientX : e.clientY;
    startSize = direction === 'col' ? getTarget().offsetWidth : getTarget().offsetHeight;
    document.body.style.cursor     = direction === 'col' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const raw     = (direction === 'col' ? e.clientX : e.clientY) - startPos;
    const delta   = invert ? -raw : raw;
    const newSize = Math.min(max, Math.max(min, startSize + delta));
    const target  = getTarget();
    if (direction === 'col') target.style.width = newSize + 'px';
    else { target.style.flex = `0 0 ${newSize}px`; target.style.height = newSize + 'px'; }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    if (storageKey) {
      const target = getTarget();
      if (target) savePanelSize(storageKey, direction === 'col' ? target.offsetWidth : target.offsetHeight);
    }
  });
}

// Init resizers after DOM is ready
initResizer(
  document.getElementById('sidebarResizer'),
  () => document.querySelector('.sidebar'),
  'col', 160, 420, false, 'sidebar'
);

initResizer(
  document.getElementById('filesResizer'),
  () => document.querySelector('.files-col'),
  'col', 160, 600, false, 'filesCol'
);

initResizer(
  document.getElementById('stagedResizer'),
  () => document.querySelector('.files-section'),
  'row', 60, 600, false, 'staged'
);

function initSidebarResizer(resizerId, sectionId, min, max) {
  initResizer(
    document.getElementById(resizerId),
    () => {
      const el = document.getElementById(sectionId);
      el.classList.remove('collapsed');
      return el;
    },
    'row', min, max, false, sectionId,
    () => {
      const el = document.getElementById(sectionId);
      return el?.classList.contains('collapsed') ? null : el;
    }
  );
}

initResizer(
  document.getElementById('stashResizer'),
  () => document.querySelector('.stash-view-files'),
  'col', 140, 480, false, 'stashFiles'
);

initResizer(
  document.getElementById('logResizer'),
  () => document.getElementById('logDetail'),
  'col', 200, 600,
  true, 'logDetail'
);

initResizer(
  document.getElementById('logDetailResizer'),
  () => document.getElementById('logDetailFiles'),
  'row', 40, 500, false, 'logDetailFiles'
);

initSidebarResizer('repoResizer',      'sectionRepo',     28, 300);
initSidebarResizer('branchesResizer',  'sectionBranches', 60, 600);
initSidebarResizer('tagsResizer',      'sectionTags',     28, 400);

export function ensureSplitVisible(selector, direction, minVisible) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;
  const current = direction === 'col' ? el.offsetWidth : el.offsetHeight;
  if (current < minVisible) {
    if (direction === 'col') el.style.width = minVisible + 'px';
    else { el.style.flex = `0 0 ${minVisible}px`; el.style.height = minVisible + 'px'; }
  }
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.buildBreadcrumb   = buildBreadcrumb;
window.switchToPanel     = switchToPanel;
window.updateCommitBadge = updateCommitBadge;
window.openFolderBrowser = openFolderBrowser;
window.navigateBrowser   = navigateBrowser;
window.ensureSplitVisible = ensureSplitVisible;
