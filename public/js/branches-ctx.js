import { ctxBranchData } from './branches-render.js';
import {
  checkoutBranch, checkoutRemoteBranch, deleteBranch, confirmDeleteRemoteBranch,
  openPullFromModal, openRenameBranchModal, openRebaseModal, mergeFromRemote,
  openNewBranchModal, pullBranchFF, openSetUpstreamModal,
} from './branches-ops.js';
import { defineContextMenu, getContextMenu } from './gvm/gvm-ctx-menus.js';

export function branchCtxShow(event, bid) {
  const data = ctxBranchData[bid];
  if (!data) return;

  let items = '';
  if (data.type === 'local') {
    if (!data.isCurrent) items += `<div class="ctx-item" onclick="branchCtxAction('checkout')">✓ Checkout</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('log')">◷ Ver historial</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item ctx-primary" onclick="branchCtxAction('pull-from')">↓ Pull desde…</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('rebase')">⎇ Rebase onto…</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('rename')">✎ Renombrar</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('create-pr')">⎇ Crear Pull Request…</div>`;
    items += `<div class="ctx-sep"></div>`;
    if (!data.tracking?.hasUpstream)
      items += `<div class="ctx-item" onclick="branchCtxAction('set-upstream')">⇡ Asignar rama remota</div>`;
    if (!data.isCurrent) items += `<div class="ctx-item ctx-danger" onclick="branchCtxAction('delete')">✕ Eliminar rama</div>`;
  } else {
    items += `<div class="ctx-item" onclick="branchCtxAction('log')">◷ Ver historial</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('checkout-remote')">⬇ Checkout local</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('new-from-remote')">⊕ Nueva rama desde aquí…</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item ctx-primary" onclick="branchCtxAction('merge-from-remote')">↓ Merge en rama actual</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('rebase-from-remote')">⎇ Rebase en esta rama</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('create-pr')">⎇ Crear Pull Request…</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item ctx-danger" onclick="branchCtxAction('delete-remote')">✕ Eliminar rama remota</div>`;
  }

  getContextMenu('branchCtxMenu').show(event, { bid }, items);
}

export function branchCtxClose()        { getContextMenu('branchCtxMenu').close(); }
export function branchCtxAction(action) { getContextMenu('branchCtxMenu').action(action); }

defineContextMenu('branchCtxMenu', {
  onAction: (action, { bid }) => {
    const data = ctxBranchData[bid];
    if (!data) return;
    const { name, fullName, tracking, type } = data;
    const upstream  = tracking?.upstream;
    const logTarget = fullName || name;
    const remoteRef = fullName?.replace(/^remotes\//, '');
    const headName  = type === 'remote'
      ? fullName?.replace(/^remotes\/[^/]+\//, '')
      : name;
    switch (action) {
      case 'checkout':           checkoutBranch(name); break;
      case 'pull-from':          openPullFromModal(name, upstream); break;
      case 'log':                window.viewBranchLog(logTarget); break;
      case 'rename':             openRenameBranchModal(name); break;
      case 'rebase':             openRebaseModal(name); break;
      case 'delete':             deleteBranch(name, upstream); break;
      case 'checkout-remote':    checkoutRemoteBranch(fullName); break;
      case 'new-from-remote':    openNewBranchModal(fullName); break;
      case 'merge-from-remote':  mergeFromRemote(fullName, 'merge'); break;
      case 'rebase-from-remote': mergeFromRemote(fullName, 'rebase'); break;
      case 'delete-remote':      confirmDeleteRemoteBranch(remoteRef); break;
      case 'create-pr':          window.openPRModal(headName); break;
      case 'pull-ff':            pullBranchFF(name, upstream); break;
      case 'set-upstream':       openSetUpstreamModal(name); break;
    }
  },
});
