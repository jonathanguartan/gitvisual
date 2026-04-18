import { emit } from './bus.js';
import { get, post } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal } from './utils.js';

// ─── Gitignore Editor ─────────────────────────────────────────────────────────

export async function openGitignoreEditor() {
  try {
    const data = await get('/repo/gitignore');
    document.getElementById('gitignoreContent').value = data.content;
    openModal('modalGitignore');
  } catch (e) { toast(e.message, 'error'); }
}

export async function saveGitignore() {
  const content = document.getElementById('gitignoreContent').value;
  try {
    await post('/repo/gitignore', { content });
    closeModal('modalGitignore');
    toast('.gitignore guardado ✓', 'success');
    emit('repo:refresh-status');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Add to .gitignore modal ──────────────────────────────────────────────────

export function openAddToGitignoreModal(inputPath, isFolder = false) {
  const cleanPath = inputPath.replace(/\\/g, '/').replace(/\/$/, '');
  const parts     = cleanPath.split('/');
  const rows      = [];

  if (isFolder) {
    for (let i = parts.length; i >= 1; i--) {
      const folderPattern = parts.slice(0, i).join('/') + '/';
      const indent = '&nbsp;'.repeat((parts.length - i) * 2);
      const label  = i === parts.length
        ? `📁 Esta carpeta: <code>${escHtml(folderPattern)}</code>`
        : `📁 ${indent}Carpeta padre: <code>${escHtml(folderPattern)}</code>`;
      rows.push({ label, pattern: folderPattern });
    }
  } else {
    rows.push({ label: '📄 Archivo exacto', pattern: cleanPath });
    for (let i = parts.length - 1; i >= 1; i--) {
      const folderPattern = parts.slice(0, i).join('/') + '/';
      const indent = '&nbsp;'.repeat((parts.length - 1 - i) * 2);
      rows.push({ label: `📁 ${indent}Carpeta: <code>${escHtml(folderPattern)}</code>`, pattern: folderPattern });
    }
    const ext = parts[parts.length - 1].includes('.') ? parts[parts.length - 1].split('.').pop() : null;
    if (ext) rows.push({ label: `🔤 Por extensión: <code>*.${escHtml(ext)}</code>`, pattern: `*.${ext}` });
  }

  const defaultIdx  = isFolder ? 0 : Math.min(1, rows.length - 1);
  const optionsHtml = rows.map((r, i) =>
    `<label class="gi-option ${i === defaultIdx ? 'gi-option-selected' : ''}" onclick="selectGiOption(${i})">
      <input type="radio" name="giPattern" value="${escAttr(r.pattern)}" ${i === defaultIdx ? 'checked' : ''} style="display:none">
      <span class="gi-dot"></span>
      <span class="gi-label">${r.label}</span>
    </label>`
  ).join('');

  const displayLabel = isFolder ? cleanPath + '/' : cleanPath;
  document.getElementById('giFilePath').textContent  = displayLabel;
  document.getElementById('giOptions').innerHTML     = optionsHtml;
  document.getElementById('giCustomInput').value     = '';
  document.getElementById('giPreview').textContent   = rows[defaultIdx]?.pattern ?? '';
  document.getElementById('giCustomRow').style.display = 'none';
  openModal('modalAddGitignore');
}

export function selectGiOption(idx) {
  document.querySelectorAll('.gi-option').forEach((el, i) => {
    el.classList.toggle('gi-option-selected', i === idx);
    el.querySelector('input').checked = i === idx;
  });
  const selected = document.querySelector('.gi-option-selected input');
  document.getElementById('giPreview').textContent = selected ? selected.value : '';
  document.getElementById('giCustomRow').style.display = 'none';
  document.getElementById('giCustomInput').value = '';
}

export function selectGiCustom() {
  document.querySelectorAll('.gi-option').forEach(el => {
    el.classList.remove('gi-option-selected');
    el.querySelector('input').checked = false;
  });
  document.getElementById('giCustomRow').style.display = '';
  document.getElementById('giCustomInput').focus();
  _updateGiCustomPreview();
}

export function _updateGiCustomPreview() {
  const val = document.getElementById('giCustomInput').value.trim();
  document.getElementById('giPreview').textContent = val || '';
}

export async function confirmAddToGitignore() {
  const customRow = document.getElementById('giCustomRow');
  let pattern;
  if (customRow.style.display !== 'none') {
    pattern = document.getElementById('giCustomInput').value.trim();
  } else {
    const checked = document.querySelector('#giOptions input[name="giPattern"]:checked');
    pattern = checked ? checked.value : '';
  }
  if (!pattern) { toast('Selecciona un patrón', 'warn'); return; }

  try {
    const data     = await get('/repo/gitignore');
    const existing = data.content;
    const lines    = existing.split('\n').map(l => l.trim());
    if (lines.includes(pattern)) {
      toast(`"${pattern}" ya está en .gitignore`, 'info');
      closeModal('modalAddGitignore');
      return;
    }
    const newContent = existing.endsWith('\n') || existing === ''
      ? existing + pattern + '\n'
      : existing + '\n' + pattern + '\n';
    await post('/repo/gitignore', { content: newContent });
    closeModal('modalAddGitignore');
    toast(`"${pattern}" añadido a .gitignore ✓`, 'success');
    emit('repo:refresh-status');
  } catch (e) { toast(e.message, 'error'); }
}
