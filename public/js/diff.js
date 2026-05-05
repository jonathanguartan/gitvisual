import { emit } from './bus.js';
import { get, post } from './api.js';
import { escHtml, spinner, toast } from './utils.js';

// ─── Diff — Syntax Highlighting ───────────────────────────────────────────────

const _langMap = {
  js:'javascript', mjs:'javascript', cjs:'javascript',
  ts:'typescript', tsx:'typescript', jsx:'javascript',
  py:'python', rb:'ruby', java:'java', cs:'csharp',
  cpp:'cpp', cc:'cpp', cxx:'cpp', c:'c', h:'c',
  go:'go', rs:'rust', php:'php', kt:'kotlin', swift:'swift',
  html:'html', htm:'html', xml:'xml', vue:'xml', svelte:'xml',
  css:'css', scss:'scss', less:'less',
  json:'json', yaml:'yaml', yml:'yaml', toml:'ini',
  md:'markdown', sh:'bash', bash:'bash', zsh:'bash',
  sql:'sql', graphql:'graphql', dockerfile:'dockerfile',
};

// ─── Diff mode (unified | split) ──────────────────────────────────────────────

let _diffMode = localStorage.getItem('gvm_diff_mode') || 'unified';
let _lastShowDiffArgs = null;

export function getDiffMode() { return _diffMode; }
export function toggleDiffMode() {
  _diffMode = _diffMode === 'unified' ? 'split' : 'unified';
  localStorage.setItem('gvm_diff_mode', _diffMode);
}

// ─── Module-level hunk patch store ────────────────────────────────────────────

const _hunks = new Map();

// ─── Word-level diff (LCS on tokens) ──────────────────────────────────────────

function _tokenize(line) {
  return line.split(/(\s+|[^a-zA-Z0-9])/).filter(Boolean);
}

function _lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  const seq = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1]) { seq.unshift({ a: i-1, b: j-1 }); i--; j--; }
    else if (dp[i-1][j] > dp[i][j-1]) i--;
    else j--;
  }
  return seq;
}

function _wordDiff(delLine, addLine) {
  // Skip word diff for very long lines to avoid O(mn) slowdown
  if (delLine.length > 500 || addLine.length > 500) return null;
  const aToks = _tokenize(delLine);
  const bToks = _tokenize(addLine);
  const common = _lcs(aToks, bToks);

  let delHtml = '', addHtml = '';
  let ai = 0, bi = 0, ci = 0;

  while (ci <= common.length) {
    const cA = ci < common.length ? common[ci].a : aToks.length;
    const cB = ci < common.length ? common[ci].b : bToks.length;

    // Changed tokens before this common block
    const changedA = aToks.slice(ai, cA);
    const changedB = bToks.slice(bi, cB);

    if (changedA.length) delHtml += `<mark class="wd-del">${escHtml(changedA.join(''))}</mark>`;
    if (changedB.length) addHtml += `<mark class="wd-add">${escHtml(changedB.join(''))}</mark>`;

    if (ci < common.length) {
      const tok = escHtml(aToks[cA]);
      delHtml += tok;
      addHtml += tok;
      ai = cA + 1;
      bi = cB + 1;
    }
    ci++;
  }

  return { delHtml, addHtml };
}

// ─── renderDiff (with word-level diff) ────────────────────────────────────────

export function renderDiff(diff, filename = '') {
  if (!diff) return '<div class="diff-hint">Sin diferencias</div>';
  const ext  = (filename.split('.').pop() || '').toLowerCase();
  const lang = _langMap[ext];

  const hl = code => {
    if (!lang || typeof hljs === 'undefined') return escHtml(code);
    try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; }
    catch { return escHtml(code); }
  };

  const ln = (o, n) => `<span class="dl-ln-old">${o !== null ? o : ''}</span><span class="dl-ln-new">${n !== null ? n : ''}</span>`;

  const lines = diff.split('\n');
  let html = '';
  let _delBuf = []; // { code, oldLn }
  let oldLn = 0, newLn = 0;

  const flushDelBuf = () => {
    for (const { code, oln } of _delBuf)
      html += `<div class="dl del">${ln(oln, null)}<span class="dl-sign">-</span><span class="dl-code">${hl(code)}</span></div>`;
    _delBuf = [];
  };

  for (const l of lines) {
    if (l.startsWith('+') && !l.startsWith('+++')) {
      newLn++;
      const addCode = l.slice(1);
      if (_delBuf.length > 0) {
        const { code: delCode, oln } = _delBuf.shift();
        const wd = _wordDiff(delCode, addCode);
        if (wd) {
          html += `<div class="dl del">${ln(oln, null)}<span class="dl-sign">-</span><span class="dl-code">${wd.delHtml}</span></div>`;
          html += `<div class="dl add">${ln(null, newLn)}<span class="dl-sign">+</span><span class="dl-code">${wd.addHtml}</span></div>`;
        } else {
          html += `<div class="dl del">${ln(oln, null)}<span class="dl-sign">-</span><span class="dl-code">${hl(delCode)}</span></div>`;
          html += `<div class="dl add">${ln(null, newLn)}<span class="dl-sign">+</span><span class="dl-code">${hl(addCode)}</span></div>`;
        }
      } else {
        html += `<div class="dl add">${ln(null, newLn)}<span class="dl-sign">+</span><span class="dl-code">${hl(addCode)}</span></div>`;
      }
    } else if (l.startsWith('-') && !l.startsWith('---')) {
      oldLn++;
      _delBuf.push({ code: l.slice(1), oln: oldLn });
    } else if (l.startsWith('@@')) {
      flushDelBuf();
      const m = l.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldLn = Number.parseInt(m[1]) - 1; newLn = Number.parseInt(m[2]) - 1; }
      html += `<div class="dl hunk">${escHtml(l)}</div>`;
    } else if (/^(diff|index|\+\+\+|---)/.test(l)) {
      flushDelBuf();
      html += `<div class="dl meta">${escHtml(l)}</div>`;
    } else {
      flushDelBuf();
      const code = l.startsWith(' ') ? l.slice(1) : l;
      oldLn++; newLn++;
      html += `<div class="dl ctx">${ln(oldLn, newLn)}<span class="dl-sign"> </span><span class="dl-code">${hl(code)}</span></div>`;
    }
  }
  flushDelBuf();
  return html;
}

// ─── renderDiffSplit (side-by-side, NetBeans style) ───────────────────────────

export function renderDiffSplit(diff, filename = '') {
  if (!diff) return '<div class="diff-hint">Sin diferencias</div>';
  const ext  = (filename.split('.').pop() || '').toLowerCase();
  const lang = _langMap[ext];
  const hl = code => {
    if (!lang || typeof hljs === 'undefined') return escHtml(code);
    try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; }
    catch { return escHtml(code); }
  };

  const lines = diff.split('\n');
  let leftHtml = '', rightHtml = '';
  let leftLn = 0, rightLn = 0;
  let delBuf = [], addBuf = [];

  const cell   = (cls, ln, code) =>
    `<div class="split-cell ${cls}"><span class="split-ln">${ln}</span><span class="split-code">${code}</span></div>`;
  const filler = () => `<div class="split-cell filler"></div>`;

  const flushChange = () => {
    if (!delBuf.length && !addBuf.length) return;
    const len = Math.max(delBuf.length, addBuf.length);
    for (let i = 0; i < len; i++) {
      const d = delBuf[i], a = addBuf[i];
      if (d !== undefined && a !== undefined) {
        const wd = _wordDiff(d, a);
        leftHtml  += wd ? cell('del', ++leftLn, wd.delHtml) : cell('del', ++leftLn, hl(d));
        rightHtml += wd ? cell('add', ++rightLn, wd.addHtml) : cell('add', ++rightLn, hl(a));
      } else if (d !== undefined) {
        leftHtml  += cell('del', ++leftLn, hl(d));
        rightHtml += filler();
      } else {
        leftHtml  += filler();
        rightHtml += cell('add', ++rightLn, hl(a));
      }
    }
    delBuf = []; addBuf = [];
  };

  for (const l of lines) {
    if      (l.startsWith('-') && !l.startsWith('---')) { delBuf.push(l.slice(1)); }
    else if (l.startsWith('+') && !l.startsWith('+++')) { addBuf.push(l.slice(1)); }
    else if (l.startsWith('@@')) {
      flushChange();
      const m = l.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { leftLn = Number.parseInt(m[1]) - 1; rightLn = Number.parseInt(m[2]) - 1; }
      const hunkHtml = `<div class="split-hunk">${escHtml(l)}</div>`;
      leftHtml += hunkHtml; rightHtml += hunkHtml;
    } else if (/^(diff|index|\+\+\+|---)/.test(l)) {
      flushChange();
      const metaHtml = `<div class="split-meta">${escHtml(l)}</div>`;
      leftHtml += metaHtml; rightHtml += metaHtml;
    } else {
      flushChange();
      if (!l) continue; // skip trailing newline artifact
      const code = l.startsWith(' ') ? l.slice(1) : l;
      const hlc  = hl(code);
      leftHtml  += cell('ctx', ++leftLn, hlc);
      rightHtml += cell('ctx', ++rightLn, hlc);
    }
  }
  flushChange();
  return `<div class="split-diff-wrap"><div class="split-pane split-pane-left">${leftHtml}</div><div class="split-pane split-pane-right">${rightHtml}</div></div>`;
}

// ─── parseDiffHunks ───────────────────────────────────────────────────────────

export function parseDiffHunks(diff) {
  const lines = diff.split('\n');
  const fileHeader = [];
  const hunks = [];
  let currentHunk = null;
  let inHeader = true;

  for (const line of lines) {
    if (inHeader) {
      if (line.startsWith('@@')) {
        inHeader = false;
        currentHunk = { header: line, lines: [] };
      } else {
        fileHeader.push(line);
      }
    } else {
      if (line.startsWith('@@')) {
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = { header: line, lines: [] };
      } else {
        if (currentHunk) currentHunk.lines.push(line);
      }
    }
  }
  if (currentHunk) hunks.push(currentHunk);
  return { fileHeader, hunks };
}

// ─── renderDiffHunkStage ──────────────────────────────────────────────────────

export function renderDiffHunkStage(diff, filename = '', staged = false) {
  if (!diff) return '<div class="diff-hint">Sin diferencias</div>';

  _hunks.clear();

  const ext  = (filename.split('.').pop() || '').toLowerCase();
  const lang = _langMap[ext];

  const hl = code => {
    if (!lang || typeof hljs === 'undefined') return escHtml(code);
    try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; }
    catch { return escHtml(code); }
  };

  const ln = (o, n) => `<span class="dl-ln-old">${o !== null ? o : ''}</span><span class="dl-ln-new">${n !== null ? n : ''}</span>`;

  const { fileHeader, hunks } = parseDiffHunks(diff);
  const fileHeaderStr = fileHeader.join('\n');

  let html = fileHeader.map(l =>
    `<div class="dl meta">${escHtml(l)}</div>`
  ).join('');

  hunks.forEach((hunk, idx) => {
    const hunkId = `h${idx}`;
    // Build the patch for this single hunk
    const patch = fileHeaderStr + '\n' + hunk.header + '\n' + hunk.lines.join('\n') + '\n';
    _hunks.set(hunkId, patch);

    const btnClass = staged ? 'hunk-btn unstage' : 'hunk-btn stage';
    const btnLabel = staged ? '− Quitar bloque' : '+ Stage bloque';
    const btnFn    = staged ? `unstageHunk('${hunkId}')` : `stageHunk('${hunkId}')`;

    html += `<div class="hunk-hdr">
      <span class="hunk-header-text">${escHtml(hunk.header)}</span>
      <button class="${btnClass}" onclick="${btnFn}">${btnLabel}</button>
    </div>`;

    // Render hunk lines with word diff + line numbers
    const hunkLines = hunk.lines;
    let _delBuf = []; // { code, oln }
    const m = hunk.header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    let oldLn = m ? Number.parseInt(m[1]) - 1 : 0;
    let newLn = m ? Number.parseInt(m[2]) - 1 : 0;

    const flushDelBuf = () => {
      for (const { code, oln } of _delBuf)
        html += `<div class="dl del">${ln(oln, null)}<span class="dl-sign">-</span><span class="dl-code">${hl(code)}</span></div>`;
      _delBuf = [];
    };

    for (const l of hunkLines) {
      if (l.startsWith('+') && !l.startsWith('+++')) {
        newLn++;
        const addCode = l.slice(1);
        if (_delBuf.length > 0) {
          const { code: delCode, oln } = _delBuf.shift();
          const wd = _wordDiff(delCode, addCode);
          if (wd) {
            html += `<div class="dl del">${ln(oln, null)}<span class="dl-sign">-</span><span class="dl-code">${wd.delHtml}</span></div>`;
            html += `<div class="dl add">${ln(null, newLn)}<span class="dl-sign">+</span><span class="dl-code">${wd.addHtml}</span></div>`;
          } else {
            html += `<div class="dl del">${ln(oln, null)}<span class="dl-sign">-</span><span class="dl-code">${hl(delCode)}</span></div>`;
            html += `<div class="dl add">${ln(null, newLn)}<span class="dl-sign">+</span><span class="dl-code">${hl(addCode)}</span></div>`;
          }
        } else {
          html += `<div class="dl add">${ln(null, newLn)}<span class="dl-sign">+</span><span class="dl-code">${hl(addCode)}</span></div>`;
        }
      } else if (l.startsWith('-') && !l.startsWith('---')) {
        oldLn++;
        _delBuf.push({ code: l.slice(1), oln: oldLn });
      } else if (l.startsWith('@@')) {
        flushDelBuf();
        html += `<div class="dl hunk">${escHtml(l)}</div>`;
      } else if (/^(diff|index|\+\+\+|---)/.test(l)) {
        flushDelBuf();
        html += `<div class="dl meta">${escHtml(l)}</div>`;
      } else {
        flushDelBuf();
        const code = l.startsWith(' ') ? l.slice(1) : l;
        oldLn++; newLn++;
        html += `<div class="dl ctx">${ln(oldLn, newLn)}<span class="dl-sign"> </span><span class="dl-code">${hl(code)}</span></div>`;
      }
    }
    flushDelBuf();
  });

  return html;
}

// ─── stageHunk / unstageHunk ──────────────────────────────────────────────────

export async function stageHunk(hunkId) {
  const patch = _hunks.get(hunkId);
  if (!patch) { toast('Hunk no encontrado', 'error'); return; }
  try {
    await post('/repo/stage-hunk', { patch, reverse: false });
    emit('repo:refresh-status');
  } catch (e) { toast(e.message, 'error'); }
}

export async function unstageHunk(hunkId) {
  const patch = _hunks.get(hunkId);
  if (!patch) { toast('Hunk no encontrado', 'error'); return; }
  try {
    await post('/repo/stage-hunk', { patch, reverse: true });
    emit('repo:refresh-status');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── showDiff ─────────────────────────────────────────────────────────────────

function _diffModeBtn(onclick) {
  const isSplit = _diffMode === 'split';
  return `<button class="btn btn-xs diff-mode-btn" onclick="${onclick}" title="${isSplit ? 'Vista unificada' : 'Vista lado a lado'}">${isSplit ? '⊟' : '⊞'}</button>`;
}

export function clearLastDiff() {
  _lastShowDiffArgs = null;
}

export async function showDiff(file, staged) {
  _lastShowDiffArgs = { file, staged };
  const el = document.getElementById('diffView');
  window.ensureSplitVisible?.('.files-col', 'col', 200);
  el.innerHTML = spinner();
  try {
    const { diff } = await get('/repo/diff', { file, staged: String(staged) });
    const content = _diffMode === 'split'
      ? renderDiffSplit(diff, file)
      : renderDiffHunkStage(diff, file, !!staged);
    el.innerHTML = `<div class="diff-filename"><span>${escHtml(file)}</span>${_diffModeBtn('toggleMainDiffMode()')}</div>${content}`;
    if (_diffMode === 'split') syncSplitPanes(el);
  } catch (e) {
    el.innerHTML = `<div class="diff-hint">Error: ${escHtml(e.message)}</div>`;
  }
}

export function parseDiffByFile(diff) {
  const files = [];
  const chunks = diff.split(/(?=^diff --git )/m).filter(s => s.trim());
  for (const chunk of chunks) {
    const m = chunk.match(/^diff --git a\/.+ b\/(.+)/m);
    const filename = m ? m[1].trim() : '(unknown)';
    files.push({ filename, diff: chunk });
  }
  return files;
}

// ─── syncSplitPanes — linked scroll between left/right panes ─────────────────

export function syncSplitPanes(container) {
  const left  = container.querySelector('.split-pane-left');
  const right = container.querySelector('.split-pane-right');
  if (!left || !right) return;
  let busy = false;
  const onScroll = (src, dst) => () => {
    if (busy) return;
    busy = true;
    dst.scrollTop  = src.scrollTop;
    dst.scrollLeft = src.scrollLeft;
    busy = false;
  };
  left.addEventListener('scroll',  onScroll(left,  right));
  right.addEventListener('scroll', onScroll(right, left));
}

// ─── Hunk navigation ─────────────────────────────────────────────────────────

export function navigateHunk(direction) {
  const diffEl = document.getElementById('diffView');
  if (!diffEl) return;
  const hunks = [...diffEl.querySelectorAll('.hunk-hdr')];
  if (!hunks.length) return;

  const containerTop = diffEl.scrollTop;
  let targetIdx = direction === 'next' ? 0 : hunks.length - 1;

  for (let i = 0; i < hunks.length; i++) {
    const hunkTop = hunks[i].offsetTop - diffEl.offsetTop;
    if (direction === 'next' && hunkTop > containerTop + 8) { targetIdx = i; break; }
    if (direction === 'prev' && hunkTop < containerTop - 8)  { targetIdx = i; }
  }

  hunks[targetIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Window assignments ───────────────────────────────────────────────────────

window.stageHunk   = stageHunk;
window.unstageHunk = unstageHunk;
window.toggleMainDiffMode = function() {
  toggleDiffMode();
  if (_lastShowDiffArgs) showDiff(_lastShowDiffArgs.file, _lastShowDiffArgs.staged);
};
window.navigateHunk = navigateHunk;
