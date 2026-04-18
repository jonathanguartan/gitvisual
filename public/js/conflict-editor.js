import { state } from './state.js';
import { get, post } from './api.js';
import { escHtml, toast, openModal, closeModal } from './utils.js';
import { emit } from './bus.js';

// ─── Conflict 3-way Editor ────────────────────────────────────────────────────

let _conflictFile   = null;
let _conflictBlocks = [];  // array of { type, lines?, ours?, theirs?, chosen: null|'ours'|'theirs'|'both' }

export async function openConflictEditor(filePath) {
  _conflictFile = filePath;
  document.getElementById('conflictFileName').textContent = filePath;
  document.getElementById('conflictBlocks').innerHTML =
    '<div class="spinner-wrap"><div class="spinner"></div></div>';
  openModal('modalConflict');

  try {
    const data = await get('/repo/conflict/content', { file: filePath });
    if (!data.hasConflicts) {
      toast('Este archivo no tiene marcadores de conflicto activos', 'warn');
      closeModal('modalConflict');
      return;
    }
    _conflictBlocks = data.blocks.map(b => ({ ...b, chosen: b.type === 'conflict' ? null : 'common' }));
    _renderConflictBlocks();
  } catch (e) {
    document.getElementById('conflictBlocks').innerHTML =
      `<div class="empty-state">⚠ ${escHtml(e.message)}</div>`;
  }
}

function _renderConflictBlocks() {
  const container = document.getElementById('conflictBlocks');
  let html = '';
  _conflictBlocks.forEach((block, idx) => {
    if (block.type === 'common') {
      const preview = (block.lines || []).slice(0, 4).map(l => escHtml(l)).join('\n');
      const more    = (block.lines || []).length > 4 ? `\n… (+${block.lines.length - 4} líneas)` : '';
      html += `<div class="conflict-common-block"><pre class="conflict-pre">${preview}${more}</pre></div>`;
      return;
    }
    const chosen = block.chosen;
    html += `
      <div class="conflict-block" data-idx="${idx}">
        <div class="conflict-pane conflict-pane-ours ${chosen === 'ours' || chosen === 'both' ? 'chosen' : ''}">
          <div class="conflict-pane-hdr">
            <button class="btn btn-xs conflict-accept-btn" onclick="conflictChoose(${idx},'ours')">⬆ Aceptar</button>
          </div>
          <pre class="conflict-pre">${escHtml(block.ours || '(vacío)')}</pre>
        </div>
        <div class="conflict-pane conflict-pane-result">
          <div class="conflict-pane-hdr conflict-result-label">Resultado</div>
          <pre class="conflict-pre conflict-result-pre">${_blockResult(block)}</pre>
        </div>
        <div class="conflict-pane conflict-pane-theirs ${chosen === 'theirs' || chosen === 'both' ? 'chosen' : ''}">
          <div class="conflict-pane-hdr">
            <button class="btn btn-xs conflict-accept-btn" onclick="conflictChoose(${idx},'theirs')">⬇ Aceptar</button>
          </div>
          <pre class="conflict-pre">${escHtml(block.theirs || '(vacío)')}</pre>
        </div>
      </div>`;
  });
  container.innerHTML = html;
  _updateSaveBtn();
}

function _blockResult(block) {
  if (!block.chosen || block.chosen === 'common') return escHtml(block.lines?.join('\n') || '');
  if (block.chosen === 'ours')   return escHtml(block.ours   || '');
  if (block.chosen === 'theirs') return escHtml(block.theirs || '');
  if (block.chosen === 'both')   return escHtml((block.ours || '') + '\n' + (block.theirs || ''));
  return '<span class="conflict-unresolved">⚠ Sin resolver</span>';
}

function _updateSaveBtn() {
  const unresolvedCount = _conflictBlocks.filter(b => b.type === 'conflict' && !b.chosen).length;
  const btn = document.querySelector('#modalConflict .btn-primary');
  if (btn) {
    btn.disabled = unresolvedCount > 0;
    btn.title    = unresolvedCount > 0 ? `${unresolvedCount} conflicto(s) sin resolver` : 'Guardar y preparar el archivo';
  }
}

export function conflictChoose(idx, side) {
  const block = _conflictBlocks[idx];
  if (!block || block.type !== 'conflict') return;

  // Toggle: clicking the same side again deselects; clicking while both clears that side
  if (block.chosen === side) {
    block.chosen = null;
  } else if (block.chosen === 'both') {
    block.chosen = side === 'ours' ? 'theirs' : 'ours';
  } else if (block.chosen && block.chosen !== side) {
    block.chosen = 'both';
  } else {
    block.chosen = side;
  }

  // Update only the affected block DOM instead of full re-render
  const blockEl = document.querySelector(`.conflict-block[data-idx="${idx}"]`);
  if (blockEl) {
    blockEl.querySelector('.conflict-pane-ours')?.classList.toggle('chosen',
      block.chosen === 'ours' || block.chosen === 'both');
    blockEl.querySelector('.conflict-pane-theirs')?.classList.toggle('chosen',
      block.chosen === 'theirs' || block.chosen === 'both');
    const resultPre = blockEl.querySelector('.conflict-result-pre');
    if (resultPre) resultPre.innerHTML = _blockResult(block);
  }
  _updateSaveBtn();
}

export function conflictAcceptAll(side) {
  _conflictBlocks.forEach((b, idx) => {
    if (b.type === 'conflict') conflictChoose(idx, side);
  });
}

export async function conflictSaveAndStage() {
  if (!_conflictFile) return;
  const unresolved = _conflictBlocks.filter(b => b.type === 'conflict' && !b.chosen).length;
  if (unresolved > 0) { toast(`${unresolved} conflicto(s) sin resolver`, 'warn'); return; }

  const content = _conflictBlocks.map(b => {
    if (b.type === 'common')      return (b.lines || []).join('\n');
    if (b.chosen === 'ours')      return b.ours   || '';
    if (b.chosen === 'theirs')    return b.theirs || '';
    if (b.chosen === 'both')      return (b.ours  || '') + '\n' + (b.theirs || '');
    return '';
  }).join('\n');

  try {
    await post('/repo/conflict/resolve', { file: _conflictFile, content });
    toast(`Conflicto en "${_conflictFile}" resuelto y preparado ✓`, 'success');
    closeModal('modalConflict');
    emit('repo:refresh-status');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Window assignments ───────────────────────────────────────────────────────
window.openConflictEditor  = openConflictEditor;
window.conflictChoose      = conflictChoose;
window.conflictAcceptAll   = conflictAcceptAll;
window.conflictSaveAndStage = conflictSaveAndStage;
