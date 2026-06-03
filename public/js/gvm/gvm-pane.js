// ─── GvmPane — Declarative resizable panels ────────────────────────────────────
//
// Place a .pane-resizer element with data attributes in the HTML.
// Call initAllGvmPanes() once after DOM is ready.
//
// HTML API:
//   <div class="pane-resizer"
//        data-dir="col|row"          required  direction of resize
//        data-target="#selector"     required  CSS selector of the pane to resize
//        data-min="80"               optional  minimum px (default 40)
//        data-max="700"              optional  maximum px (default 2000)
//        data-storage="key"          optional  localStorage key for persistence
//        data-uncollapse="true"      optional  remove .collapsed from target on drag start
//        data-invert="true">         optional  resize the next sibling instead
//   </div>

import { GvmComponent } from './gvm-component.js';

const _PREFIX = 'gvm_panel_';

function _save(key, size) {
  try { localStorage.setItem(_PREFIX + key, String(size)); } catch (_) {}
}

function _load(key) {
  try {
    const v = localStorage.getItem(_PREFIX + key);
    return v != null ? Number.parseFloat(v) : NaN;
  } catch (_) { return NaN; }
}

function _applySize(el, dir, size) {
  if (dir === 'col') {
    el.style.width = size + 'px';
    el.style.flex  = `0 0 ${size}px`;
  } else {
    el.style.height = size + 'px';
    el.style.flex   = `0 0 ${size}px`;
  }
}

function _readSize(el, dir) {
  return dir === 'col' ? el.offsetWidth : el.offsetHeight;
}

export class GvmPane extends GvmComponent {
  constructor(el) {
    super(el);
    const ds = el.dataset;
    this._dir        = ds.dir                    || 'col';
    this._min        = Number.parseFloat(ds.min  ?? 40);
    this._max        = Number.parseFloat(ds.max  ?? 2000);
    this._key        = ds.storage                || null;
    this._targetSel  = ds.target                 || null;
    this._uncollapse = ds.uncollapse === 'true';
    this._invert     = ds.invert     === 'true';

    this._dragging  = false;
    this._startPos  = 0;
    this._startSize = 0;

    // Bound handlers kept as properties so destroy() can removeEventListener
    this._boundMousedown = this._onMousedown.bind(this);
    this._boundMousemove = this._onMousemove.bind(this);
    this._boundMouseup   = this._onMouseup.bind(this);

    this._el.addEventListener('mousedown', this._boundMousedown);
    document.addEventListener('mousemove', this._boundMousemove);
    document.addEventListener('mouseup',   this._boundMouseup);

    // Restore persisted size
    if (this._key) {
      const saved = _load(this._key);
      if (!isNaN(saved) && saved >= this._min && saved <= this._max) {
        requestAnimationFrame(() => {
          const t = this._getTarget();
          if (t && !t.classList.contains('collapsed')) _applySize(t, this._dir, saved);
        });
      }
    }
  }

  _getTarget() {
    if (this._targetSel) return document.querySelector(this._targetSel);
    return this._invert ? this._el.nextElementSibling : this._el.previousElementSibling;
  }

  _onMousedown(e) {
    const target = this._getTarget();
    if (!target) return;
    if (this._uncollapse) target.classList.remove('collapsed');
    this._dragging  = true;
    this._el.classList.add('dragging');
    this._startPos  = this._dir === 'col' ? e.clientX : e.clientY;
    this._startSize = _readSize(target, this._dir);
    document.body.style.cursor     = this._dir === 'col' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  _onMousemove(e) {
    if (!this._dragging) return;
    const target = this._getTarget();
    if (!target) return;
    const raw   = (this._dir === 'col' ? e.clientX : e.clientY) - this._startPos;
    const delta = this._invert ? -raw : raw;
    _applySize(target, this._dir, Math.min(this._max, Math.max(this._min, this._startSize + delta)));
  }

  _onMouseup() {
    if (!this._dragging) return;
    this._dragging = false;
    this._el.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    if (this._key) {
      const target = this._getTarget();
      if (target && !target.classList.contains('collapsed')) {
        _save(this._key, _readSize(target, this._dir));
      }
    }
  }

  destroy() {
    this._el.removeEventListener('mousedown', this._boundMousedown);
    document.removeEventListener('mousemove', this._boundMousemove);
    document.removeEventListener('mouseup',   this._boundMouseup);
    super.destroy();
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const _instances = [];

/**
 * Discover all .pane-resizer elements in the DOM and instantiate a GvmPane for each.
 * Called once by panels.js after DOM is ready.
 */
export function initAllGvmPanes() {
  document.querySelectorAll('.pane-resizer').forEach(el => {
    _instances.push(new GvmPane(el));
  });
}

/**
 * Ensure a pane is at least minVisible px large.
 * Used when showing a panel for the first time.
 */
export function ensurePaneVisible(selector, dir, minVisible) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;
  const current = dir === 'col' ? el.offsetWidth : el.offsetHeight;
  if (current < minVisible) _applySize(el, dir, minVisible);
}
