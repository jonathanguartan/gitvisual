// ─── Estado compartido del panel de archivos ──────────────────────────────────
// Objeto mutable centralizado, importado por todos los sub-módulos de files-*.js

export const fileState = {
  selected:     { staged: new Set(), unstaged: new Set() },
  activeDiffPath: null,
  activeDiffList: null,
  activeTreeItem: null, // { kind: 'file'|'folder', path, listType }
  lastClicked:  { staged: null, unstaged: null, clean: null },
  viewMode: {
    staged:   localStorage.getItem('gvm_view_staged')   || 'list',
    unstaged: localStorage.getItem('gvm_view_unstaged') || 'list',
    clean:    localStorage.getItem('gvm_view_clean')    || 'list',
  },
  collapsedFolders: { staged: new Set(), unstaged: new Set(), clean: new Set() },
  fileFilter: 'all',
  fileSearch: '',
};
