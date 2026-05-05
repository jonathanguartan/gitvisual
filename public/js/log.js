import { defineList, getList } from './gvm/gvm-lists.js';
import { emit } from './bus.js';
import { state } from './state.js';
import { get, opPost } from './api.js';
import { escHtml, escAttr, relTime, toast, openModal, closeModal, copyToClipboard, spinner, empty } from './utils.js';
import { defineEditor, getEditor } from './gvm/gvm-editors.js';
import { defineContextMenu, getContextMenu } from './gvm/gvm-ctx-menus.js';
import { dialog } from './gvm/gvm-dialog.js';

// ─── Render ───────────────────────────────────────────────────────────────────

function _authorColor(name) {
  const palette = ['#89b4fa','#a6e3a1','#f9e2af','#cba6f7','#f38ba8','#94e2d5','#fab387','#89dceb'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function _renderLogItem(c, idx, { selected }) {
  const hash  = c.hash;
  const short = hash.slice(0, 7);
  const refsHtml = (c.refs || '').split(',').filter(Boolean).map(r => {
    let name = r.trim();
    let type = 'branch';
    if (name.startsWith('tag:'))    { type = 'tag';  name = name.replace('tag:', '').trim(); }
    if (name.includes('HEAD ->'))   { type = 'head'; name = name.replace('HEAD ->', '').trim(); }
    return `<span class="log-ref ${type}">${escHtml(name)}</span>`;
  }).join(' ');

  const initial     = escHtml((c.author_name || '?')[0].toUpperCase());
  const avatarColor = _authorColor(c.author_name);

  return `<div class="log-item${selected ? ' selected' : ''}">
    <div class="log-avatar" style="background:${avatarColor}" title="${escAttr(c.author_name)}">${initial}</div>
    <div class="log-content">
      <div class="log-msg-row">
        <div class="log-msg">${escHtml(c.message)}</div>
        <div class="log-item-actions">
          <button class="log-act" onclick="event.stopPropagation();window.openCherryPickModal('${escAttr(hash)}')" title="Cherry-pick">🍒</button>
          <button class="log-act" onclick="event.stopPropagation();openResetModal('${escAttr(hash)}')" title="Reset aquí">↺</button>
          <button class="log-act" onclick="event.stopPropagation();window.openCreateBranchAtModal('${escAttr(hash)}')" title="Crear rama aquí">⎇</button>
        </div>
      </div>
      <div class="log-meta">
        ${refsHtml}
        <span class="log-hash" data-action="copy-hash" title="Copiar hash">${short}</span>
      </div>
    </div>
    <div class="log-author-col" title="${escAttr(c.author_name)}">${escHtml(c.author_name)}</div>
    <div class="log-date-col">${relTime(c.date)}</div>
  </div>`;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadLog(branch) {
  if (branch !== undefined) state.logBranch = branch;
  const el  = document.getElementById('commitLog');
  const svg = document.getElementById('logGraph');
  const searchInput = document.getElementById('logSearch');
  const search = searchInput ? searchInput.value.trim() : '';

  const indicator = document.getElementById('logBranchIndicator');
  if (indicator) {
    if (state.logBranch) {
      indicator.textContent = `⎇ ${state.logBranch}`;
      indicator.style.display = '';
    } else {
      indicator.style.display = 'none';
    }
  }

  el.innerHTML = spinner();
  el.style.height = '';
  if (svg) { svg.innerHTML = ''; svg.style.height = '0px'; }

  try {
    const params = { limit: '100', search };
    if (state.logBranch) params.branch = state.logBranch;
    const data = await get('/repo/log', params);
    if (state.logBranch && data.branchNotFound) {
      state.logBranch = null;
      if (indicator) indicator.style.display = 'none';
      toast(`La rama "${params.branch}" ya no existe localmente`, 'warn');
    }
    const commits = data.all || [];

    if (commits.length === 0) {
      el.innerHTML = empty('📋', search ? 'No se encontraron resultados' : 'Sin commits todavía');
      el.style.height = '';
      return;
    }

    state.logCommits     = commits;
    state.logSelectedIdx = -1;

    getList('commitLog')?.setItems(commits);

    if (svg && commits.length > 0) requestAnimationFrame(() => drawGraph(commits, svg));

    if (state.logBranch && commits.length > 0) {
      const first = commits[0];
      showCommitDetail(first.hash, first.message, first.author_name, first.date);
    }

  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error('loadLog error:', e);
    el.innerHTML = empty('⚠', e.message);
    el.style.height = '';
  }
}

// ─── Commit detail ────────────────────────────────────────────────────────────

async function showCommitDetail(hash, message, author, date) {
  const idx = (state.logCommits || []).findIndex(c => c.hash === hash);
  state.logSelectedIdx = idx;
  if (idx >= 0) getList('commitLog')?.selectIndex(idx, false);

  document.getElementById('logDetailEmpty').style.display   = 'none';
  document.getElementById('logDetailContent').style.display = '';

  document.getElementById('logDetailHdr').innerHTML = `
    <div class="log-detail-msg" title="${escAttr(message)}">${escHtml(message)}</div>
    <div class="log-detail-meta">
      <span class="log-hash" onclick="copyToClipboard('${hash}')" title="Copiar hash" style="cursor:pointer">${hash.slice(0,7)}</span>
      <span>${escHtml(author)}</span>
      <span>${relTime(date)}</span>
    </div>
  `;

  const diffEl = document.getElementById('logDetailDiff');
  diffEl.className = 'log-detail-diff';
  diffEl.innerHTML = '';
  document.getElementById('logDetailResizer').style.display = 'none';
  document.getElementById('logDetailFiles').style.flex = '';

  const filesEl = document.getElementById('logDetailFiles');
  filesEl.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';

  try {
    const data  = await get('/repo/commit/files', { hash });
    const files = data.files || [];

    if (files.length === 0) {
      document.getElementById('logDetailStats').innerHTML = '';
      filesEl.innerHTML = '<div class="empty-state-small">Sin archivos modificados</div>';
      return;
    }
    const totalAdd = files.reduce((s, f) => s + (f.add || 0), 0);
    const totalDel = files.reduce((s, f) => s + (f.del || 0), 0);
    document.getElementById('logDetailStats').innerHTML =
      totalAdd + totalDel > 0
        ? `<span class="ldf-stat-add">+${totalAdd}</span><span class="ldf-stat-del">−${totalDel}</span>`
        : '';

    filesEl.innerHTML = files.map(f => {
      const statsHtml = (f.add || f.del)
        ? `<span class="ldf-stat-add">+${f.add}</span><span class="ldf-stat-del">−${f.del}</span>`
        : '';
      return `
        <div class="log-detail-file" data-path="${escAttr(f.path)}">
          <span class="ldf-status ${f.status}">${f.status}</span>
          <span class="ldf-name" title="${escAttr(f.path)}">${escHtml(f.path)}</span>
          <span class="ldf-stats">${statsHtml}</span>
        </div>
      `;
    }).join('');

    filesEl.onclick = (e) => {
      const row = e.target.closest('.log-detail-file');
      if (row) showCommitFileDiff(hash, row.dataset.path, row);
    };
  } catch (e) {
    filesEl.innerHTML = `<div class="empty-state-small">${escHtml(e.message)}</div>`;
  }
}

// ─── File diff ────────────────────────────────────────────────────────────────

async function showCommitFileDiff(hash, file, rowEl) {
  document.querySelectorAll('.log-detail-file').forEach(el => el.classList.remove('active'));
  rowEl.classList.add('active');

  const diffEl    = document.getElementById('logDetailDiff');
  const filesEl   = document.getElementById('logDetailFiles');
  const resizerEl = document.getElementById('logDetailResizer');

  if (resizerEl.style.display === 'none') {
    const savedH = Number.parseInt(localStorage.getItem('gvm_panel_logDetailFiles'));
    filesEl.style.flex = `0 0 ${!isNaN(savedH) && savedH >= 40 ? savedH + 'px' : '45%'}`;
    resizerEl.style.display = '';
  }

  window.ensureSplitVisible?.('#logDetail', 'row', 150);
  diffEl.className = 'log-detail-diff visible';
  const editor = getEditor('logDetailDiff');
  editor.setLoading();

  try {
    const data = await get('/repo/commit/diff', { hash, file });
    editor.render(data.diff || '', file);
  } catch (e) {
    editor.setHint(escHtml(e.message));
  }
}

// ─── Graph ────────────────────────────────────────────────────────────────────

function drawGraph(commits, svg) {
  const ITEM_HEIGHT  = 44;
  const COLUMN_WIDTH = 12;
  const RADIUS       = 3.5;
  const MARGIN_LEFT  = 25;

  const lanes = [];
  const commitMap = new Map();
  commits.forEach((c, i) => commitMap.set(c.hash, { ...c, index: i }));

  let html = '';

  commits.forEach((c, i) => {
    let lane = lanes.indexOf(c.hash);
    if (lane === -1) {
      lane = lanes.findIndex(l => l === null);
      if (lane === -1) { lane = lanes.length; lanes.push(c.hash); }
      else { lanes[lane] = c.hash; }
    }

    const x = MARGIN_LEFT + (lane * COLUMN_WIDTH);
    const y = (i * ITEM_HEIGHT) + (ITEM_HEIGHT / 2);

    const parents = (c.parents || []).filter(p => commitMap.has(p));
    lanes[lane] = null;

    parents.forEach((pHash) => {
      const parent = commitMap.get(pHash);
      let pLane = lanes.indexOf(pHash);
      if (pLane === -1) {
        pLane = lanes.findIndex(l => l === null);
        if (pLane === -1) { pLane = lanes.length; lanes.push(pHash); }
        else { lanes[pLane] = pHash; }
      }
      const px = MARGIN_LEFT + (pLane * COLUMN_WIDTH);
      const py = (parent.index * ITEM_HEIGHT) + (ITEM_HEIGHT / 2);
      html += `<path d="M ${x} ${y} C ${x} ${y + 15}, ${px} ${py - 15}, ${px} ${py}"
                     fill="none" class="lane-${lane % 7}" stroke-width="1.5" />`;
    });

    html += `<circle cx="${x}" cy="${y}" r="${RADIUS}" fill="var(--bg2)"
                     class="lane-${lane % 7}" stroke-width="2" style="stroke: currentColor" />`;
  });

  svg.innerHTML = html;
  svg.style.height = (commits.length * ITEM_HEIGHT) + 'px';
}

// ─── Keyboard navigation ─────────────────────────────────────────────────────

export function navigateLog(direction) {
  getList('commitLog')?.focusNeighbor(direction);
}

export function navigateLogFiles(direction) {
  const items = Array.from(document.querySelectorAll('#logDetailFiles .log-detail-file'));
  if (!items.length) return;
  const active = items.findIndex(el => el.classList.contains('active'));
  const next = active + direction;
  if (next < 0 || next >= items.length) return;
  items[next].click();
}

export function resetLogState() {
  state.logBranch      = null;
  state.logCommits     = [];
  state.logSelectedIdx = -1;
  getList('commitLog')?.setItems([]);
  const searchInput = document.getElementById('logSearch');
  if (searchInput) searchInput.value = '';
  const indicator = document.getElementById('logBranchIndicator');
  if (indicator) indicator.style.display = 'none';
}

// ─── Commit Context Menu ──────────────────────────────────────────────────────

export function commitCtxShow(event, hash, message) {
  const short = hash.slice(0, 7);
  let items = '';
  items += `<div class="ctx-item" onclick="commitCtxAction('copy-short')">📋 Copiar hash corto (${short})</div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('copy-full')">📋 Copiar hash completo</div>`;
  items += `<div class="ctx-sep"></div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('cherry-pick')">🍒 Cherry-pick</div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('branch-here')">⎇ Crear rama aquí</div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('tag-here')">◈ Crear tag aquí</div>`;
  items += `<div class="ctx-sep"></div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('squash')">⊕ Squash commits…</div>`;
  items += `<div class="ctx-sep"></div>`;
  items += `<div class="ctx-item ctx-warn" onclick="commitCtxAction('reset')">↺ Reset aquí…</div>`;
  items += `<div class="ctx-item ctx-danger" onclick="commitCtxAction('revert')">↩ Revertir commit</div>`;
  getContextMenu('commitCtxMenu').show(event, { hash, message }, items);
}

export function commitCtxClose() { getContextMenu('commitCtxMenu').close(); }

export function commitCtxAction(action) { getContextMenu('commitCtxMenu').action(action); }

// ─── Reset ────────────────────────────────────────────────────────────────────

let _resetHash = null;

export function openResetModal(hash) {
  _resetHash = hash;
  document.getElementById('resetTargetHash').textContent = hash.slice(0, 7);
  document.getElementById('resetMode').value = 'mixed';
  openModal('modalReset');
}

export async function confirmReset() {
  const mode = document.getElementById('resetMode').value;
  if (!_resetHash) return;
  if (mode === 'hard' && !await dialog.confirm(`¿Reset HARD a ${_resetHash.slice(0,7)}?\nSe perderán TODOS los cambios no commiteados. Esta acción no se puede deshacer.`, { type: 'danger', title: 'Reset Hard', confirmText: 'Reset' })) return;
  try {
    await opPost('/repo/reset', { hash: _resetHash, mode }, `Reset ${mode} a ${_resetHash.slice(0,7)}…`);
    emit('repo:refresh');
    closeModal('modalReset');
    toast(`Reset ${mode} completado ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function revertCommit(hash) {
  if (!await dialog.confirm(`¿Revertir commit ${hash.slice(0,7)}?\nSe creará un nuevo commit deshaciendo los cambios.`, { type: 'warn', confirmText: 'Revertir' })) return;
  try {
    await opPost('/repo/commit/revert', { hash }, `Revirtiendo ${hash.slice(0,7)}…`);
    emit('repo:refresh');
    toast('Commit revertido ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Window assignments for HTML onclick handlers ─────────────────────────────

window.commitCtxShow        = commitCtxShow;
window.commitCtxAction      = commitCtxAction;
window.commitCtxClose       = commitCtxClose;
window.openResetModal       = openResetModal;
window.confirmReset         = confirmReset;
window.showCommitDetail     = showCommitDetail;
window.showCommitFileDiff   = showCommitFileDiff;
window.loadLog              = loadLog;

// ─── List & editor registration (consumed by panels.js) ───────────────────────

defineEditor('logDetailDiff', {});

defineContextMenu('commitCtxMenu', {
  onAction: (action, { hash }) => {
    switch (action) {
      case 'copy-short':  copyToClipboard(hash.slice(0, 7)); break;
      case 'copy-full':   copyToClipboard(hash); break;
      case 'cherry-pick': window.openCherryPickModal(hash); break;
      case 'branch-here': window.openCreateBranchAtModal(hash); break;
      case 'tag-here':    window.openTagAtModal(hash); break;
      case 'squash':      window.openSquashModal(); break;
      case 'reset':       openResetModal(hash); break;
      case 'revert':      revertCommit(hash); break;
    }
  },
});

defineList('commitLog', {
  renderItem: _renderLogItem,
  onActivate: (c, idx, e) => {
    if (e?.target?.dataset.action === 'copy-hash') { copyToClipboard(c.hash); return; }
    showCommitDetail(c.hash, c.message, c.author_name, c.date);
  },
  onCtxMenu: (e, c) => commitCtxShow(e, c.hash, c.message),
});
