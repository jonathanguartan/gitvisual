import { state } from './state.js';
import { get, post, opPost, api } from './api.js';
import { escHtml, escAttr, relTime, toast, openModal, closeModal, spinner, empty } from './utils.js';

// ─── Render: Pull Requests ────────────────────────────────────────────────────

export async function loadPRs() {
  const el = document.getElementById('prsList');
  el.innerHTML = spinner();

  // Siempre obtener info fresca para evitar usar datos del repo anterior
  try {
    const info = await get('/repo/info');
    state.repoInfo      = info;
    state.currentBranch = info.currentBranch;
    state.githubInfo    = info.githubInfo;
  } catch (_) { /* ignorar, usar caché si falla */ }

  if (!state.githubInfo) {
    el.innerHTML = empty('⎇', 'No se detectó repositorio remoto compatible');
    return;
  }
  document.getElementById('prRepoLabel').textContent = `${state.githubInfo.type.toUpperCase()}: ${state.githubInfo.owner}/${state.githubInfo.repo}`;
  try {
    const prs = await get('/pr/list', { 
      owner: state.githubInfo.owner, 
      repo:  state.githubInfo.repo, 
      type:  state.githubInfo.type 
    });
    const prLabel = state.githubInfo.type === 'gitlab' ? 'Merge Requests' : 'Pull Requests';
    if (!prs.length) { el.innerHTML = empty('⎇', `Sin ${prLabel} abiertos`); return; }
    el.innerHTML = prs.map(pr => `
      <div class="pr-card">
        <div class="pr-card-title">#${pr.number} ${escHtml(pr.title)}</div>
        <div class="pr-card-branch">⎇ ${escHtml(pr.head.ref)} → ${escHtml(pr.base.ref)}</div>
        <div class="pr-card-meta">
          Por <strong>${escHtml(pr.user.login)}</strong> · ${relTime(pr.created_at)}
          · <a href="${escAttr(pr.html_url)}" target="_blank">Ver en ${state.githubInfo.type} ↗</a>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = empty('⚠', e.message);
  }
}

// ─── Pull Request ──────────────────────────────────────────────────────────────

export async function openCreatePRModal(headBranch = null) {
  if (!state.githubInfo) { toast('No se detectó repositorio remoto compatible (GitHub/Bitbucket/GitLab). Verifica el remote.', 'warn'); return; }

  const type = state.githubInfo.type;

  const auth = await get('/pr/auth', { type });
  if (!auth.ok) {
    toast(auth.message, 'warn');
    window.openSettingsModal('general');
    return;
  }

  const platformName = { github: 'GitHub', bitbucket: 'Bitbucket', gitlab: 'GitLab', gitea: 'Gitea' }[type] || type;
  const prLabel      = type === 'gitlab' ? 'Merge Request' : 'Pull Request';
  document.getElementById('modalPRTitle').textContent    = `Crear ${prLabel}`;
  document.getElementById('btnSubmitPR').textContent     = `Crear ${prLabel} en ${platformName}`;

  const allBranches = Object.values(state.branches?.branches || {});
  const localBranches = allBranches
    .filter(b => !b.name.startsWith('remotes/'))
    .map(b => b.name);

  // For base: local + remote (deduplicated by name, stripping "remotes/origin/" prefix)
  const remoteBranchNames = allBranches
    .filter(b => b.name.startsWith('remotes/'))
    .map(b => b.name.replace(/^remotes\/[^/]+\//, ''));
  const baseCandidates = [...new Set([...localBranches, ...remoteBranchNames])].sort();

  // Ensure mainBranch is always in the base list even if not fetched locally
  const mb = state.repoInfo?.defaultBranch || window.mainBranch || 'main';
  if (!baseCandidates.includes(mb)) baseCandidates.unshift(mb);

  // headBranch puede venir del menú contextual (rama local o remota sin prefijo remoto)
  const selectedHead = headBranch || state.currentBranch;

  document.getElementById('prHead').innerHTML = localBranches
    .map(b => `<option value="${escAttr(b)}" ${b === selectedHead ? 'selected' : ''}>${escHtml(b)}</option>`)
    .join('');

  document.getElementById('prBase').innerHTML = baseCandidates
    .map(b => `<option value="${escAttr(b)}" ${b === mb ? 'selected' : ''}>${escHtml(b)}</option>`)
    .join('');

  document.getElementById('prTitle').value = '';
  document.getElementById('prBody').value  = '';
  openModal('modalPR');
}

export async function submitPR() {
  const title = document.getElementById('prTitle').value.trim();
  const head  = document.getElementById('prHead').value;
  const base  = document.getElementById('prBase').value;
  const body  = document.getElementById('prBody').value;

  if (!title)       { toast('El PR necesita un título', 'warn'); return; }
  if (head === base) { toast('La rama origen y destino no pueden ser iguales', 'warn'); return; }

  if (!state.githubInfo) { toast('No se detectó repositorio remoto compatible', 'warn'); return; }
  try {
    const type    = state.githubInfo.type;
    const prLabel = type === 'gitlab' ? 'MR' : 'PR';
    const result = await post('/pr/create', {
      owner: state.githubInfo.owner,
      repo:  state.githubInfo.repo,
      type,
      title, body, head, base,
    });
    closeModal('modalPR');
    toast(`${prLabel} #${result.pr.number} creado ✓`, 'success');
    if (result.pr.html_url) window.open(result.pr.html_url, '_blank');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Window assignments ────────────────────────────────────────────────────────

window.openPRModal  = openCreatePRModal;
window.submitPR     = submitPR;
window.loadPRs      = loadPRs;
