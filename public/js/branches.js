/**
 * branches.js — Agregador: importa los módulos de ramas y expone funciones globales.
 *
 *   branches-render.js → Árbol visual, filtro, render de items y repo-info
 *   branches-ops.js    → Operaciones (checkout, delete, rename, rebase, etc.)
 *   branches-ctx.js    → Menú contextual (show/close/action)
 */

// Re-exportar para que init.js pueda importar desde un solo lugar si es necesario
export { renderBranches, renderRepoInfo, buildBranchTree, renderBranchTree, onBranchFilter, toggleBranchFolder, toggleUnpublishedFilter, setSelectedBranch } from './branches-render.js';
export { checkoutBranch, checkoutRemoteBranch, createBranch, deleteBranch, confirmDeleteBranch, openRebaseModal, confirmRebase, openRenameBranchModal, confirmRenameBranch, openNewBranchModal, updateCreateBranchBtn, mergeFromRemote, conflictAbort, conflictContinue, openPullFromModal, confirmPullFrom, confirmDeleteRemoteBranch, pullBranchFF, openCreateBranchAtModal, openSetUpstreamModal, confirmSetUpstream, openCompareBranchesModal, loadBranchCompare, openMergedBranchesModal, deleteSelectedMergedBranches, viewBranchLog, checkoutNewBranchFromRemote, openSquashModal, confirmSquash, updateSquashPreview } from './branches-ops.js';
export { branchCtxShow, branchCtxClose, branchCtxAction } from './branches-ctx.js';

// ─── Imports para window assignments ─────────────────────────────────────────
import { renderBranches, renderRepoInfo, buildBranchTree, renderBranchTree, onBranchFilter, toggleBranchFolder, toggleUnpublishedFilter } from './branches-render.js';
import { checkoutBranch, checkoutRemoteBranch, createBranch, deleteBranch, confirmDeleteBranch, openRebaseModal, confirmRebase, openRenameBranchModal, confirmRenameBranch, openNewBranchModal, updateCreateBranchBtn, mergeFromRemote, conflictAbort, conflictContinue, openPullFromModal, confirmPullFrom, confirmDeleteRemoteBranch, pullBranchFF, openCreateBranchAtModal, openSetUpstreamModal, confirmSetUpstream, openCompareBranchesModal, loadBranchCompare, openMergedBranchesModal, deleteSelectedMergedBranches, viewBranchLog, checkoutNewBranchFromRemote, openSquashModal, confirmSquash, updateSquashPreview } from './branches-ops.js';
import { branchCtxShow, branchCtxClose, branchCtxAction } from './branches-ctx.js';

// ─── Window assignments para handlers de HTML ────────────────────────────────
window.branchCtxShow            = branchCtxShow;
window.branchCtxClose           = branchCtxClose;
window.branchCtxAction          = branchCtxAction;
window.toggleBranchFolder       = toggleBranchFolder;
window.viewBranchLog            = viewBranchLog;
window.checkoutBranch           = checkoutBranch;
window.checkoutRemoteBranch     = checkoutRemoteBranch;
window.deleteBranch             = deleteBranch;
window.confirmDeleteBranch      = confirmDeleteBranch;
window.openRenameBranchModal    = openRenameBranchModal;
window.confirmRenameBranch      = confirmRenameBranch;
window.openRebaseModal          = openRebaseModal;
window.confirmRebase            = confirmRebase;
window.openNewBranchModal       = openNewBranchModal;
window.createBranch             = createBranch;
window.updateCreateBranchBtn    = updateCreateBranchBtn;
window.checkoutNewBranchFromRemote = checkoutNewBranchFromRemote;
window.mergeFromRemote             = mergeFromRemote;
window.openPullFromModal           = openPullFromModal;
window.confirmPullFrom             = confirmPullFrom;
window.conflictAbort               = conflictAbort;
window.conflictContinue            = conflictContinue;
window.pullBranchFF             = pullBranchFF;
window.openCreateBranchAtModal  = openCreateBranchAtModal;
window.openSetUpstreamModal     = openSetUpstreamModal;
window.confirmSetUpstream       = confirmSetUpstream;
window.openCompareBranchesModal   = openCompareBranchesModal;
window.loadBranchCompare          = loadBranchCompare;
window.onBranchFilter             = onBranchFilter;
window.toggleUnpublishedFilter    = toggleUnpublishedFilter;
window.openMergedBranchesModal    = openMergedBranchesModal;
window.deleteSelectedMergedBranches = deleteSelectedMergedBranches;
window.openSquashModal    = openSquashModal;
window.confirmSquash      = confirmSquash;
window.updateSquashPreview = updateSquashPreview;
