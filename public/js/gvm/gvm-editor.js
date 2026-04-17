/**
 * GvmEditor — Diff viewer component
 *
 * Encapsulates: unified/split mode toggle, .diff-filename header, syncSplitPanes,
 * loading state, and hint messages.
 *
 * Usage:
 *   const editor = new GvmEditor({
 *     el,                    // container element (required)
 *     onToggle: () => {},    // called after mode changes; if omitted re-renders from cache
 *   });
 *
 *   editor.render(diff, file)      // standard diff view with .diff-filename header
 *   editor.setContent(html)        // raw HTML; wires any .diff-mode-btn found
 *   editor.setLoading()            // shows spinner
 *   editor.setHint(html)           // shows <div class="diff-hint">{html}</div>
 *   editor.destroy()               // clear + release
 */

import { GvmComponent } from './gvm-component.js';
import { renderDiff, renderDiffSplit, getDiffMode, toggleDiffMode, syncSplitPanes } from '../diff.js';
import { escHtml, spinner } from '../utils.js';

export class GvmEditor extends GvmComponent {
  constructor(opts = {}) {
    super(opts.el);
    this._onToggle = opts.onToggle || null;
    this._diff = '';
    this._file = '';
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Render diff with standard .diff-filename header. Caches diff+file for mode toggle. */
  render(diff, file) {
    this._diff = diff;
    this._file = file;
    this._doRender();
  }

  /**
   * Set raw HTML content. Wires any .diff-mode-btn present.
   * Use this when the caller builds a custom header (e.g. fh-diff-header).
   * If getDiffMode() === 'split', syncSplitPanes is called automatically.
   */
  setContent(html) {
    this._el.innerHTML = html;
    if (getDiffMode() === 'split') syncSplitPanes(this._el);
    this._wireModeBtn();
  }

  /** Show spinner while loading. */
  setLoading() {
    this._el.innerHTML = spinner();
  }

  /** Show a hint message. html may contain inline HTML tags. */
  setHint(html) {
    this._el.innerHTML = `<div class="diff-hint">${html}</div>`;
  }

  destroy() {
    this._diff = '';
    this._file = '';
    super.destroy();
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  _doRender() {
    const isSplit = getDiffMode() === 'split';
    const modeBtn = `<button class="btn btn-xs diff-mode-btn" title="${isSplit ? 'Vista unificada' : 'Vista lado a lado'}">${isSplit ? '⊟' : '⊞'}</button>`;
    const content = isSplit
      ? renderDiffSplit(this._diff, this._file)
      : renderDiff(this._diff, this._file);
    this._el.innerHTML = `<div class="diff-filename"><span>${escHtml(this._file)}</span>${modeBtn}</div>${content}`;
    if (isSplit) syncSplitPanes(this._el);
    this._wireModeBtn();
  }

  _wireModeBtn() {
    this._el.querySelector('.diff-mode-btn')?.addEventListener('click', () => this._toggleMode(), { once: true });
  }

  _toggleMode() {
    toggleDiffMode();
    if (this._onToggle) {
      this._onToggle();
    } else if (this._diff !== undefined) {
      this._doRender();
    }
  }
}
