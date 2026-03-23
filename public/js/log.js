import { state } from './state.js';
import { get, post, opPost } from './api.js';
import { escHtml, escAttr, relTime, toast, openModal, closeModal, showCtxMenu, closeAllCtxMenus, copyToClipboard, spinner, empty } from './utils.js';
import { renderDiff, renderDiffSplit, getDiffMode, toggleDiffMode, syncSplitPanes } from './diff.js';

// ─── Render: Log ──────────────────────────────────────────────────────────────

let _logBranch = null;

export async function loadLog(branch) {
  if (branch !== undefined) _logBranch = branch;
  const el = document.getElementById('commitLog');
  const svg = document.getElementById('logGraph');
  const searchInput = document.getElementById('logSearch');
  const search = searchInput ? searchInput.value.trim() : '';

  const indicator = document.getElementById('logBranchIndicator');
  if (indicator) {
    if (_logBranch) {
      indicator.textContent = `⎇ ${_logBranch}`;
      indicator.style.display = '';
    } else {
      indicator.style.display = 'none';
    }
  }

  el.innerHTML = spinner();
  if (svg) {
    svg.innerHTML = '';
    svg.style.height = '0px';
  }

  try {
    const params = { limit: '100', search };
    if (_logBranch) params.branch = _logBranch;
    const data = await get('/repo/log', params);
    const commits = data.all || [];

    if (commits.length === 0) {
      el.innerHTML = empty('📋', search ? 'No se encontraron resultados' : 'Sin commits todavía');
      return;
    }

    el.innerHTML = commits.map(c => {
      const refsHtml = (c.refs || '').split(',').filter(Boolean).map(r => {
        let name = r.trim();
        let type = 'branch';
        if (name.startsWith('tag:')) { type = 'tag'; name = name.replace('tag:', '').trim(); }
        if (name.includes('HEAD ->')) { type = 'head'; name = name.replace('HEAD ->', '').trim(); }
        return `<span class="log-ref ${type}">${escHtml(name)}</span>`;
      }).join(' ');

      return `
        <div class="log-item" id="commit-${c.hash}"
             onclick="showCommitDetail('${c.hash}','${escAttr(c.message)}','${escAttr(c.author_name)}','${escAttr(c.date)}')"
             oncontextmenu="commitCtxShow(event,'${c.hash}','${escAttr(c.message)}')">
          <div class="log-content">
            <div class="log-msg">${escHtml(c.message)}</div>
            <div class="log-meta">
              ${refsHtml}
              <span class="log-hash" onclick="event.stopPropagation();copyToClipboard('${c.hash}')" title="Copiar hash">${c.hash.slice(0, 7)}</span>
              <span><strong>${escHtml(c.author_name)}</strong></span>
              <span>${relTime(c.date)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (svg && commits.length > 0) {
      requestAnimationFrame(() => drawGraph(commits, svg));
    }

    if (_logBranch && commits.length > 0) {
      const first = commits[0];
      showCommitDetail(first.hash, first.message, first.author_name, first.date);
    }

  } catch (e) {
    console.error('loadLog error:', e);
    el.innerHTML = empty('⚠', e.message);
  }
}

async function showCommitDetail(hash, message, author, date) {
  document.querySelectorAll('.log-item').forEach(el => el.classList.remove('selected'));
  const item = document.getElementById(`commit-${hash}`);
  if (item) item.classList.add('selected');

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
      filesEl.innerHTML = '<div class="empty-state-small">Sin archivos modificados</div>';
      return;
    }
    filesEl.innerHTML = files.map(f => `
      <div class="log-detail-file" onclick="showCommitFileDiff('${escAttr(hash)}','${escAttr(f.path)}',this)">
        <span class="ldf-status ${f.status}">${f.status}</span>
        <span class="ldf-name" title="${escAttr(f.path)}">${escHtml(f.path)}</span>
      </div>
    `).join('');
  } catch (e) {
    filesEl.innerHTML = `<div class="empty-state-small">${escHtml(e.message)}</div>`;
  }
}

let _logDiffArgs = null;

async function showCommitFileDiff(hash, file, rowEl) {
  document.querySelectorAll('.log-detail-file').forEach(el => el.classList.remove('active'));
  rowEl.classList.add('active');

  const diffEl    = document.getElementById('logDetailDiff');
  const filesEl   = document.getElementById('logDetailFiles');
  const resizerEl = document.getElementById('logDetailResizer');

  if (resizerEl.style.display === 'none') {
    const savedH = parseInt(localStorage.getItem('gvm_panel_logDetailFiles'));
    filesEl.style.flex = `0 0 ${!isNaN(savedH) && savedH >= 40 ? savedH + 'px' : '45%'}`;
    resizerEl.style.display = '';
  }

  _logDiffArgs = { hash, file };
  window.ensureSplitVisible?.('#logDetail', 'col', 260);
  diffEl.className = 'log-detail-diff visible';
  diffEl.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';

  try {
    const data = await get('/repo/commit/diff', { hash, file });
    _renderLogDiff(diffEl, data.diff || '', file);
  } catch (e) {
    diffEl.innerHTML = `<div class="diff-hint">${escHtml(e.message)}</div>`;
  }
}

function _renderLogDiff(diffEl, diff, file) {
  const isSplit = getDiffMode() === 'split';
  const modeBtn = `<button class="btn btn-xs diff-mode-btn" onclick="toggleLogDiffMode()" title="${isSplit ? 'Vista unificada' : 'Vista lado a lado'}">${isSplit ? '⊟' : '⊞'}</button>`;
  const content = isSplit ? renderDiffSplit(diff, file) : renderDiff(diff, file);
  diffEl.innerHTML = `<div class="diff-filename"><span>${escHtml(file)}</span>${modeBtn}</div>${content}`;
  if (isSplit) syncSplitPanes(diffEl);
}

function drawGraph(commits, svg) {
  const ITEM_HEIGHT = 44;
  const COLUMN_WIDTH = 12;
  const RADIUS = 3.5;
  const MARGIN_LEFT = 25;

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

// ─── Commit Context Menu ──────────────────────────────────────────────────────

let _commitCtxData = null;

export function commitCtxShow(event, hash, message) {
  event.preventDefault();
  event.stopPropagation();
  _commitCtxData = { hash, message };

  const short = hash.slice(0, 7);
  let items = '';
  items += `<div class="ctx-item" onclick="commitCtxAction('copy-short')">📋 Copiar hash corto (${short})</div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('copy-full')">📋 Copiar hash completo</div>`;
  items += `<div class="ctx-sep"></div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('cherry-pick')">🍒 Cherry-pick</div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('branch-here')">⎇ Crear rama aquí</div>`;
  items += `<div class="ctx-item" onclick="commitCtxAction('tag-here')">◈ Crear tag aquí</div>`;
  items += `<div class="ctx-sep"></div>`;
  items += `<div class="ctx-item ctx-danger" onclick="commitCtxAction('revert')">↩ Revertir commit</div>`;

  showCtxMenu('commitCtxMenu', event, items);
}

export function commitCtxClose() {
  document.getElementById('commitCtxMenu').style.display = 'none';
}

export function commitCtxAction(action) {
  closeAllCtxMenus();
  const d = _commitCtxData;
  if (!d) return;
  switch (action) {
    case 'copy-short':  copyToClipboard(d.hash.slice(0, 7)); break;
    case 'copy-full':   copyToClipboard(d.hash); break;
    case 'cherry-pick': window.openCherryPickModal(d.hash); break;
    case 'branch-here': window.openCreateBranchAtModal(d.hash); break;
    case 'tag-here':    window.openTagAtModal(d.hash); break;
    case 'revert':      revertCommit(d.hash); break;
  }
}

async function revertCommit(hash) {
  if (!confirm(`¿Revertir commit ${hash.slice(0,7)}?\nSe creará un nuevo commit deshaciendo los cambios.`)) return;
  try {
    await opPost('/repo/commit/revert', { hash }, `Revirtiendo ${hash.slice(0,7)}…`);
    await window.refreshAll();
    toast('Commit revertido ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.commitCtxShow   = commitCtxShow;
window.commitCtxAction = commitCtxAction;
window.commitCtxClose  = commitCtxClose;
window.showCommitDetail     = showCommitDetail;
window.showCommitFileDiff   = showCommitFileDiff;
window.loadLog              = loadLog;
window.toggleLogDiffMode = function() {
  toggleDiffMode();
  if (_logDiffArgs) {
    const diffEl = document.getElementById('logDetailDiff');
    get('/repo/commit/diff', _logDiffArgs).then(data => _renderLogDiff(diffEl, data.diff || '', _logDiffArgs.file)).catch(() => {});
  }
};
