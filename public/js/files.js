/**
 * files.js — Agregador del panel de archivos.
 *
 *   files-state.js     → Estado compartido mutable (selectedFiles, activeDiff, viewMode…)
 *   files-render.js    → renderStatus, renderFileItem, fileIcon, árbol, filtro, view toggle
 *   files-select.js    → Multi-select, click, drag&drop, keyboard nav, batch ops
 *   files-ops.js       → Ctx menus de archivo/carpeta, ops individuales (stage/unstage/discard…)
 *   files-history.js   → Modal de historial de archivo
 *   files-gitignore.js → Editor .gitignore y modal add-to-gitignore
 */

export { renderStatus, fileIcon, setCount, setFileFilter, toggleFileView, toggleTreeFolder, expandAllTree, collapseAllTree, togglePanelMaximize, setFileSearch, invalidateCleanCache } from './files-render.js';
export { fileItemClick, toggleFileSelection, clearFileSelection, stageSelected, unstageSelected, discardSelected, untrackSelected, stageOrUnstageActiveFile, fileDragStart, fileDragEnd, fileDragOver, fileDragLeave, fileDrop } from './files-select.js';
export { stageFile, unstageFile, discardFile, removeFile, removeFolder, openFileInEditor, resolveConflictSide, fileCtxShow, fileCtxAction, folderCtxShow, folderCtxAction } from './files-ops.js';
export { openFileHistory, fhRowClick, filterFileHistory, toggleFhMaximize, showFileHistoryDiff, toggleFhList, openBlame, toggleBlameMaximize } from './files-history.js';
export { openGitignoreEditor, saveGitignore, openAddToGitignoreModal, selectGiOption, selectGiCustom, _updateGiCustomPreview, confirmAddToGitignore } from './files-gitignore.js';

// ─── Imports para window assignments ─────────────────────────────────────────
import { renderStatus, fileIcon, setCount, setFileFilter, toggleFileView, toggleTreeFolder, expandAllTree, collapseAllTree, togglePanelMaximize, setFileSearch } from './files-render.js';
import { fileItemClick, toggleFileSelection, clearFileSelection, stageSelected, unstageSelected, discardSelected, untrackSelected, stageOrUnstageActiveFile, fileDragStart, fileDragEnd, fileDragOver, fileDragLeave, fileDrop } from './files-select.js';
import { stageFile, unstageFile, discardFile, removeFile, removeFolder, openFileInEditor, resolveConflictSide, fileCtxShow, fileCtxAction, folderCtxShow, folderCtxAction } from './files-ops.js';
import { openFileHistory, fhRowClick, filterFileHistory, toggleFhMaximize, showFileHistoryDiff, toggleFhList, openBlame, toggleBlameMaximize } from './files-history.js';
import { openGitignoreEditor, saveGitignore, openAddToGitignoreModal, selectGiOption, selectGiCustom, _updateGiCustomPreview, confirmAddToGitignore } from './files-gitignore.js';

// ─── Window assignments para handlers de HTML ────────────────────────────────
window.toggleFileView      = toggleFileView;
window.toggleTreeFolder    = toggleTreeFolder;
window.expandAllTree       = expandAllTree;
window.collapseAllTree     = collapseAllTree;
window.folderCtxShow       = folderCtxShow;
window.folderCtxAction     = folderCtxAction;
window.fileCtxShow         = fileCtxShow;
window.fileCtxAction       = fileCtxAction;
window.toggleFileSelection = toggleFileSelection;
window.fileItemClick       = fileItemClick;
window.fileDragStart       = fileDragStart;
window.fileDragEnd         = fileDragEnd;
window.fileDragOver        = fileDragOver;
window.fileDragLeave       = fileDragLeave;
window.fileDrop            = fileDrop;
window.clearFileSelection  = clearFileSelection;
window.stageSelected       = stageSelected;
window.unstageSelected     = unstageSelected;
window.discardSelected     = discardSelected;
window.untrackSelected     = untrackSelected;
window.stageOrUnstageActiveFile = stageOrUnstageActiveFile;
window.stageFile           = stageFile;
window.unstageFile         = unstageFile;
window.discardFile         = discardFile;
window.removeFile          = removeFile;
window.removeFolder        = removeFolder;
window.openFileInEditor    = openFileInEditor;
window.resolveConflictSide = resolveConflictSide;
window.setFileFilter       = setFileFilter;
window.setFileSearch       = setFileSearch;
window.togglePanelMaximize = togglePanelMaximize;
window.openFileHistory       = openFileHistory;
window.showFileHistoryDiff   = showFileHistoryDiff;
window.fhRowClick            = fhRowClick;
window.toggleFhMaximize      = toggleFhMaximize;
window.toggleFhList          = toggleFhList;
window.filterFileHistory     = filterFileHistory;
window.openBlame            = openBlame;
window.toggleBlameMaximize  = toggleBlameMaximize;
window.openGitignoreEditor       = openGitignoreEditor;
window.saveGitignore             = saveGitignore;
window.openAddToGitignoreModal   = openAddToGitignoreModal;
window.selectGiOption            = selectGiOption;
window.selectGiCustom            = selectGiCustom;
window._updateGiCustomPreview    = _updateGiCustomPreview;
window.confirmAddToGitignore     = confirmAddToGitignore;
