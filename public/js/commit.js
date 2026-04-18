import { state } from './state.js';
import { post, opPost } from './api.js';
import { toast, escHtml } from './utils.js';
import { emit } from './bus.js';

// ─── Commit ───────────────────────────────────────────────────────────────────

export async function doCommit(messageOverride = null) {
  const msg    = messageOverride || document.getElementById('commitMessage').value.trim();
  const amend  = !messageOverride && document.getElementById('chkAmend')?.checked;
  const andPush = !messageOverride && document.getElementById('chkCommitPush')?.checked;

  if (!msg) { toast('Escribe un mensaje de commit', 'warn'); return false; }
  if (!amend && !(state.status?.files || []).some(f => f.index !== ' ' && f.index !== '?')) {
    toast('No hay archivos en stage', 'warn'); return false;
  }
  try {
    const label = amend ? '📝 Modificando último commit…' : '📝 Haciendo commit…';
    const result = await opPost('/repo/commit', { message: msg, amend: !!amend }, label);
    if (result === null) return false;
    if (!messageOverride) document.getElementById('commitMessage').value = '';
    emit('repo:refresh');
    if (!messageOverride) toast(amend ? 'Commit modificado ✓' : 'Commit realizado ✓', 'success');
    if (andPush) await window.doPush();
    return true;
  } catch (e) { toast(e.message, 'error'); return false; }
}

// ─── Commit templates ─────────────────────────────────────────────────────────

const COMMIT_TEMPLATES = [
  { label: 'feat: Nueva funcionalidad',       value: 'feat: '     },
  { label: 'fix: Corrección de bug',          value: 'fix: '      },
  { label: 'docs: Documentación',             value: 'docs: '     },
  { label: 'style: Formato / estilo',         value: 'style: '    },
  { label: 'refactor: Refactorización',       value: 'refactor: ' },
  { label: 'test: Tests',                     value: 'test: '     },
  { label: 'chore: Mantenimiento',            value: 'chore: '    },
  { label: 'perf: Rendimiento',               value: 'perf: '     },
  { label: 'ci: Integración continua',        value: 'ci: '       },
  { label: 'revert: Revertir cambio',         value: 'revert: '   },
];

export function toggleTemplateDropdown(event) {
  event.stopPropagation();
  const dd = document.getElementById('templateDropdown');
  if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }
  dd.innerHTML = COMMIT_TEMPLATES.map(t =>
    `<div class="template-item" onclick="applyCommitTemplate('${t.value}')">${t.label}</div>`
  ).join('');
  dd.style.display = 'block';
}

export function applyCommitTemplate(value) {
  const ta = document.getElementById('commitMessage');
  ta.value = value;
  ta.focus();
  ta.setSelectionRange(value.length, value.length);
  document.getElementById('templateDropdown').style.display = 'none';
}

document.addEventListener('click', () => {
  const dd = document.getElementById('templateDropdown');
  if (dd) dd.style.display = 'none';
});

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.toggleTemplateDropdown = toggleTemplateDropdown;
window.applyCommitTemplate    = applyCommitTemplate;
window.doCommit               = doCommit;
